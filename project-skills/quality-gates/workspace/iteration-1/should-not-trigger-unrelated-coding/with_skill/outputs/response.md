# Eval 12: should-not-trigger-unrelated-coding (Re-run with Minimal Mode)

**Prompt:** Write a Python script to scrape data from example.com and save it to CSV.

**Skill Applied:** using-quality-gates (Minimal Mode)

---

## Response

Here's a Python script to scrape data from example.com and save it to CSV:

```python
import csv
import requests
from bs4 import BeautifulSoup

def scrape_to_csv(url: str, output_file: str = "output.csv"):
    """Scrape data from a webpage and save to CSV."""
    response = requests.get(url)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Extract data - customize based on target structure
    data = []
    for element in soup.find_all('p'):  # Example: extract all paragraphs
        text = element.get_text(strip=True)
        if text:
            data.append({'content': text})
    
    # Write to CSV
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['content'])
        writer.writeheader()
        writer.writerows(data)
    
    print(f"Saved {len(data)} items to {output_file}")

if __name__ == "__main__":
    scrape_to_csv("https://example.com")
```

**Usage:**
```bash
pip install requests beautifulsoup4
python scrape.py
```

---

**Note:** Consider adding tests for this script. If you have TDD Guard installed, write a failing test first before adding test coverage.

---

**Result:** ✅ Minimal mode applied — Task completed directly, brief TDD mention at end, no full workflow explanation
