"""Make the public blank template from an authorized local reference.

Usage: python3 scripts/prepare-template.py /path/to/reference.xlsx
Original copy and document metadata are never copied into the repository.
Only the bundled default is sanitized. User-uploaded templates are preserved.
"""
import re
import sys
import zipfile
from pathlib import Path

source = Path(sys.argv[1])
target = Path(__file__).resolve().parents[1] / 'public/templates/push-default.xlsx'
target.parent.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as output:
    for info in original.infolist():
        content = original.read(info.filename)
        if info.filename == 'xl/worksheets/sheet1.xml':
            text = content.decode('utf-8')
            text = re.sub(r'<c\b([^>]*\br="(?:C|H)[2-7]"[^>]*?)(?:/>|>.*?</c>)',
                          lambda m: '<c' + re.sub(r'\s+t="[^"]*"', '', m.group(1)) + '/>', text)
            content = text.encode('utf-8')
        elif info.filename == 'xl/sharedStrings.xml':
            # Keep run properties as rich-text style exemplars; replace every original payload.
            text = content.decode('utf-8')
            index = [0]
            def clean_shared(match):
                i = index[0]
                index[0] += 1
                if i < 40:
                    return match.group(0)
                return re.sub(r'(<t\b[^>]*>)(.*?)(</t>)', lambda t: t.group(1) + ('✨' if any(ord(c) > 0x1F000 for c in t.group(2)) else 'Sample') + t.group(3), match.group(0))
            text = re.sub(r'<si>.*?</si>', clean_shared, text)
            text = re.sub(r'(<sst\b[^>]*\s)count="\d+"', r'\1count="44"', text)
            content = text.encode('utf-8')
        elif info.filename == 'docProps/core.xml':
            content = b'<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>'
        elif info.filename == 'docProps/custom.xml':
            content = b'<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"/>'
        elif info.filename.startswith('xl/printerSettings/'):
            # Printer settings may embed machine/user information; remove them from the default.
            continue
        if info.filename == 'xl/worksheets/sheet1.xml':
            content = re.sub(rb'(<pageSetup\b[^>]*?)\s+r:id="[^"]*"', rb'\1', content)
        elif info.filename == 'xl/worksheets/_rels/sheet1.xml.rels':
            content = re.sub(rb'<Relationship\b[^>]*Type="[^"]*/printerSettings"[^>]*/>', b'', content)
        elif info.filename == '[Content_Types].xml':
            content = re.sub(rb'<Override\b[^>]*PartName="/xl/printerSettings/[^"]*"[^>]*/>', b'', content)
        output.writestr(info.filename, content)

print(f'Wrote sanitized default template: {target}')
