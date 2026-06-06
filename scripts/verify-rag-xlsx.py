import argparse
import json
import random
import sys
import time
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict


NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_xlsx_rows(path: str, sheet_path: str = "xl/worksheets/sheet1.xml"):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("a:si", NS):
                texts = [t.text or "" for t in si.findall(".//a:t", NS)]
                shared.append("".join(texts))

        sroot = ET.fromstring(z.read(sheet_path))
        rows = sroot.find("a:sheetData", NS)
        data = []
        for row in rows.findall("a:row", NS):
            vals = []
            for c in row.findall("a:c", NS):
                ctype = c.attrib.get("t")
                is_node = c.find("a:is", NS)
                v = c.find("a:v", NS)
                if is_node is not None:
                    text = "".join((tt.text or "") for tt in is_node.findall(".//a:t", NS))
                elif v is None:
                    text = ""
                else:
                    text = v.text or ""
                    if ctype == "s" and shared:
                        text = shared[int(text)]
                vals.append(text)
            data.append(vals)
        header = data[0]
        return [dict(zip(header, row)) for row in data[1:] if any(row)]


def choose_cases(items, per_category: int, seed: int):
    random.seed(seed)
    grouped = defaultdict(list)
    for item in items:
        grouped[item["Category"]].append(item)

    selected = []
    for category, rows in grouped.items():
        if len(rows) <= per_category:
            selected.extend(rows)
        else:
            selected.extend(random.sample(rows, per_category))
    return selected


def ask_chat(base_url: str, message: str, user_id: str, chat_id: str):
    payload = json.dumps(
        {
            "message": message,
            "userId": user_id,
            "chatId": chat_id,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def normalize_text(value: str) -> str:
    return " ".join((value or "").lower().replace("\n", " ").split())


def simple_pass(expected: str, actual: str) -> bool:
    expected_norm = normalize_text(expected)
    actual_norm = normalize_text(actual)
    if not expected_norm or not actual_norm:
        return False

    expected_tokens = [token for token in expected_norm.replace(",", " ").replace(".", " ").split() if len(token) > 3]
    if not expected_tokens:
        return expected_norm in actual_norm

    hits = sum(1 for token in expected_tokens[:10] if token in actual_norm)
    threshold = max(1, min(4, len(expected_tokens) // 2))
    return hits >= threshold


def build_language_smoke_cases():
    return [
        {
            "Category": "Language Smoke",
            "Sub-Category": "Urdu Greeting",
            "Question": "سلام",
            "Expected Answer": "Snakitos Assistant",
        },
        {
            "Category": "Language Smoke",
            "Sub-Category": "Roman Urdu Refund",
            "Question": "refund chahiye",
            "Expected Answer": "order number phone number photos videos",
        },
        {
            "Category": "Language Smoke",
            "Sub-Category": "Urdu Photos",
            "Question": "تصاویر کہاں بھیجوں؟",
            "Expected Answer": "WhatsApp Email order number phone number",
        },
        {
            "Category": "Language Smoke",
            "Sub-Category": "Roman Urdu Product",
            "Question": "ChickPea Puffs kya hai?",
            "Expected Answer": "ChickPea Puffs price",
        },
        {
            "Category": "Language Smoke",
            "Sub-Category": "Urdu Product Compare",
            "Question": "Stix Hot & Spicy اور Stix Lemon and Chilli میں فرق کیا ہے؟",
            "Expected Answer": "Stix Hot Spicy Stix Lemon Chilli price",
        },
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", required=True)
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--per-category", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", default="scripts/verify-rag-xlsx-results.json")
    parser.add_argument("--skip-language-smoke", action="store_true")
    args = parser.parse_args()

    items = read_xlsx_rows(args.xlsx)
    selected = choose_cases(items, args.per_category, args.seed)
    if not args.skip_language_smoke:
      selected.extend(build_language_smoke_cases())

    results = []
    category_stats = defaultdict(lambda: {"total": 0, "pass": 0})

    for index, item in enumerate(selected, start=1):
        category = item["Category"]
        question = item["Question"]
        expected = item["Expected Answer"]
        try:
            response = ask_chat(args.base_url, question, "xlsx-runner", f"xlsx-runner-{index}")
            actual = response.get("response", "")
            passed = simple_pass(expected, actual)
            results.append(
                {
                    "category": category,
                    "sub_category": item["Sub-Category"],
                    "question": question,
                    "expected": expected,
                    "actual": actual,
                    "passed": passed,
                }
            )
        except Exception as exc:
            results.append(
                {
                    "category": category,
                    "sub_category": item["Sub-Category"],
                    "question": question,
                    "expected": expected,
                    "actual": f"ERROR: {exc}",
                    "passed": False,
                }
            )

        category_stats[category]["total"] += 1
        category_stats[category]["pass"] += 1 if results[-1]["passed"] else 0
        time.sleep(0.05)

    summary = {
        "total": len(results),
        "passed": sum(1 for row in results if row["passed"]),
        "failed": sum(1 for row in results if not row["passed"]),
        "per_category": {
            category: {
                "total": stats["total"],
                "passed": stats["pass"],
                "failed": stats["total"] - stats["pass"],
            }
            for category, stats in sorted(category_stats.items())
        },
        "results": results,
    }

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)

    print(json.dumps({k: v for k, v in summary.items() if k != "results"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.exit(main())
