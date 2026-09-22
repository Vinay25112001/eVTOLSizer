"""Validate XML documents against an XML Schema with lxml.

    python validation/xsd-validate.py SCHEMA.xsd DOC.xml [DOC.xml ...]

Prints one JSON object per document: {"file", "valid", "errors"}.
Exit 0 when every document is valid, 1 otherwise, 3 when lxml is missing.
Used by validation/cpacs-export.mjs; Node has no schema validator of its own.
"""
import json
import sys

try:
    from lxml import etree
except ImportError:
    print(json.dumps({"error": "lxml is not installed (pip install lxml)"}))
    sys.exit(3)

schema = etree.XMLSchema(etree.parse(sys.argv[1]))
ok = True
for path in sys.argv[2:]:
    doc = etree.parse(path)
    valid = schema.validate(doc)
    ok = ok and valid
    errors = [f"line {e.line}: {e.message}" for e in schema.error_log][:20]
    print(json.dumps({"file": path, "valid": valid, "errors": errors}))
sys.exit(0 if ok else 1)
