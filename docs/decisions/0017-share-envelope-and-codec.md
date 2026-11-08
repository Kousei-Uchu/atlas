# 0017. The share link is a bearer copy built from the export model, and decoding treats it as hostile

Date: 2026-11-05. Status: proposed (the user may veto). Records D-049 and D-050.

**The envelope comes from the export model (D-049).** `buildEnvelope` takes the model that Markdown, SVG and PNG already use, so a link can only hold what the inclusion rule let through, and the export leak tests cover it. The envelope has its own strict schema, not the profile schema. It has no ids and no audience, not even the audience's name, and the title is the view's name, not the profile's. Items point to their state by position in a short list of the states used, which keeps links small. The fixed statement that preferences are not consent is part of the schema as a literal, so a link that changes it does not open (I-02).

Spec 11.2 listed both `groups` and `items` at the top level. Items sit inside their group here, so each item cannot lose its heading.

**The codec (D-050).** The payload is base64url of raw DEFLATE of the envelope's JSON, with the format version in the fragment as `#atlas=1.<payload>`. Decoding goes in this order, and stops at the first failure with a plain message:

1. Encoded size (256 KiB), and only the base64url alphabet, with no padding.
2. Inflate as a stream and cancel as soon as the output passes 2 MiB, so a small payload cannot expand into memory.
3. Strict UTF-8, then JSON.
4. Reserved keys and depth, with the same walk imports use (I-08).
5. The envelope schema: strict fields, hex colours, known icons and patterns, length and count limits, states that exist, notes only if the envelope says it has them.

Control characters are removed, markup is kept as plain text, and nothing is evaluated. Every failure is a code and a sentence, and nothing throws. The fragment never goes to a server, and the app has no hash routing, so nothing else claims it (D-017).

**Not decided here.** What the preview looks like, how a copy is saved, size warnings and the fixed privacy copy (I-07) come in the next steps.
