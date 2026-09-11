import time
import requests
import torch

# Configuration
API_URL = "http://localhost:8080/api/vitals"
WINDOW_SIZE = 5            # Number of previous seconds to baseline against
DROP_THRESHOLD_PCT = 0.20  # 20% drop triggers an alert
POLL_INTERVAL = 1.0        # Seconds between API polls

def fetch_bpm(url):
    """Fetches current BPM from API endpoint."""
    try:
        response = requests.get(url, timeout=2)
        response.raise_for_status()
        data = response.json()
        
        # Adjust key based on your actual API JSON structure (e.g., data["bpm"])
        return float(data.get("bpm", 0))
    except Exception as e:
        print(f"Error fetching API data: {e}")
        return None

def check_bpm_drop(bpm_tensor, window_size, threshold):
    """
    Analyzes PyTorch tensor to detect if current BPM dropped below rolling average.
    """
    if bpm_tensor.shape[0] < window_size + 1:
        return False, 0.0, 0.0

    # Separate historical baseline window from the latest reading
    baseline_window = bpm_tensor[-(window_size + 1):-1]
    current_bpm = bpm_tensor[-1]

    # Compute baseline average using PyTorch tensor operations
    baseline_avg = torch.mean(baseline_window)

    if baseline_avg == 0:
        return False, 0.0, 0.0

    # Calculate percentage drop
    drop_pct = (baseline_avg - current_bpm) / baseline_avg
    is_drop = drop_pct.item() >= threshold

    return is_drop, drop_pct.item(), baseline_avg.item()

def main():
    # Initialize an empty PyTorch 1D float tensor
    bpm_history = torch.empty(0, dtype=torch.float32)

    print(f"Starting BPM monitor on {API_URL}...")
    print(f"Alert condition: >{DROP_THRESHOLD_PCT*100}% drop compared to {WINDOW_SIZE}-sec average.\n")

    while True:
        bpm = fetch_bpm(API_URL)

        if bpm is not None:
            # Append new reading to PyTorch tensor
            new_val = torch.tensor([bpm], dtype=torch.float32)
            bpm_history = torch.cat((bpm_history, new_val))

            # Keep tensor size manageable (keep only max required history)
            max_size = WINDOW_SIZE + 10
            if bpm_history.shape[0] > max_size:
                bpm_history = bpm_history[-max_size:]

            # Run detection if enough data points exist
            if bpm_history.shape[0] >= WINDOW_SIZE + 1:
                has_dropped, drop_pct, avg = check_bpm_drop(
                    bpm_history, WINDOW_SIZE, DROP_THRESHOLD_PCT
                )

                status = "NORMAL"
                if has_dropped:
                    status = f"⚠️ ALERT: Drop Detected! (-{drop_pct*100:.1f}%)"

                print(f"Current BPM: {bpm:.1f} | Rolling Avg: {avg:.1f} | Status: {status}")

        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()