# Third party notices

Passport runtime source is newly authored for Steven Ochs and The Book of Houses. It does not vendor third-party runtime libraries, private Toll Bench code, Ente code or Bitwarden code.

- Python and the browser are user-supplied runtimes with their own licenses. They are not redistributed in the package.
- Web Crypto is a browser API used for AES-GCM and random key generation. Documentation reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API . No MDN prose or examples were copied into runtime code.
- Apache License 2.0 text was taken from Toll Bench's existing public Toll Harness LICENSE, which supplies the standard license text. NOTICE/author conventions follow that project. Passport citation metadata refers to Passport itself.
- Hatchling, build, Twine, Node, jsbeautifier and Playwright are development/build/test tools, not runtime dependencies or vendored distributions. Their upstream licenses apply to their own code. GitHub Actions are referenced at verified upstream commit hashes, not copied into the package.

Any future vendored material must add its source, exact version, license and required attribution here before release. Package contents must remain limited to the public Passport boundary.
