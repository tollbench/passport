# Releasing Passport

Canonical repository: https://github.com/tollbench/passport . Distribution: `toll-passport`. Current release version: `0.1.0a9`. GitHub releases and PyPI availability are separate receipts.

1. Review public boundary, source provenance, LICENSE, NOTICE, citation and dependency changes. Run tests and build/install the wheel, including browser assets. Inspect wheel/sdist contents for private material.
2. Commit reviewed changes, wait for CI, create a matching `v0.1.0a9` tag and mark the GitHub release as a prerelease. Attach the inspected wheel, sdist and SHA256SUMS.
3. The PyPI Trusted Publisher is configured for: project `toll-passport`, owner `tollbench`, repository `passport`, workflow `publish.yml`, GitHub environment `pypi`. Official setup: https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/ . This account binding cannot be inferred from Toll Harness's separate project.
4. Configure the repository's `pypi` environment protections before publishing. Run `publish.yml` explicitly on the reviewed version tag. The workflow validates the tag, tests/builds and publishes through OIDC with no stored PyPI token. Do not use secrets from another project.
5. Verify the public PyPI version, artifact hashes/provenance and installation from that artifact. Record the result. If account setup is missing, report PyPI publishing as pending; a locally built wheel is not a published PyPI package.

Release assets must represent the tagged source. Toll Bench later consumes explicit tested versions. Updating Passport creates proposed integration updates; it does not authorize deployment.
