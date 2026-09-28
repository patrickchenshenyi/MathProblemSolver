#!/usr/bin/env python3
"""Build eval/aimo3-reference.json from the AIMO3 reference-problems PDF.

Requires pypdf (`pip install pypdf`), then:
    python3 build-aimo3-dataset.py

Statements are the PDF text layer (layout mode), kept verbatim. The
`statement_quality` field flags problems whose notation the text layer mangles:
  clean            - safe to use as-is
  minor-artifacts  - readable, a few missing spaces after symbols
  needs-review     - notation scrambled (fix by hand before trusting results)
"""

import json
import os
import pathlib
import re

import pypdf

# 自包含默认值：PDF 随仓库放在 project/research/ 下；用 AIMO3_PDF 可覆盖。
PDF = pathlib.Path(
    os.environ.get('AIMO3_PDF')
    or (pathlib.Path(__file__).resolve().parent.parent
        / 'project' / 'research' / 'AIMO3_Reference_Problems.pdf')
)
OUT = pathlib.Path(__file__).with_name('aimo3-reference.json')

QUALITY = {
    '1': 'clean',
    '2': 'clean',
    '3': 'minor-artifacts',
    '4': 'clean',
    '5': 'clean',
    '6': 'needs-review',
    '7': 'minor-artifacts',
    '8': 'clean',
    '9': 'minor-artifacts',
    '10': 'clean',
}


def main() -> None:
    reader = pypdf.PdfReader(str(PDF))
    text = '\n'.join(
        (page.extract_text(extraction_mode='layout') or '') for page in reader.pages
    )
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'Problem (\d+)\s*\n', text)]
    problems = []
    for index, (position, number) in enumerate(marks):
        end = marks[index + 1][0] if index + 1 < len(marks) else len(text)
        chunk = text[position:end]
        answer = re.search(r'Answer:\s*([0-9]+)', chunk)
        statement = re.search(r'Problem:\s*(.+?)(?:\n\s*Answer:)', chunk, re.S)
        if answer is None or statement is None:
            continue
        problems.append({
            'id': f'aimo3-ref-{int(number):02d}',
            'source': f'AIMO Progress Prize 3 reference problem {number}',
            'answer': int(answer.group(1)),
            'statement': ' '.join(statement.group(1).split()),
            'statement_quality': QUALITY.get(number, 'unknown'),
        })
    payload = {
        'dataset': 'aimo3-reference',
        'description': (
            'AIMO3 Reference Bench (10 problems, November 2025), the "hard" set. '
            'Answers are the official ones (5 digits, i.e. mod 10^5, except where the '
            'printed answer is shorter). Statements come from the PDF text layer.'
        ),
        'answer_range': [0, 99999],
        'problems': problems,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print(f'wrote {OUT} with {len(problems)} problems')


if __name__ == '__main__':
    main()
