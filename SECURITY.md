# Security policy

Please report security vulnerabilities privately, not in public issues.

- Report via [GitHub's private vulnerability reporting](https://github.com/pp-techs/pp-browser/security/advisories/new), or email the maintainers listed in the repository.

Please include a description of the problem, the steps to reproduce it, and the affected version. We will acknowledge the report and work on a fix before any public disclosure.

## Scope

pp-browser runs local browser automation: a daemon on `127.0.0.1` with a bearer token, browser profiles with stored cookies and proxy credentials in `~/.ppb`, and a bundled Camoufox browser. Reports about the daemon's authentication, local file handling, or proxy handling are in scope. Reports about third-party sites blocking automation, or the terms of service of sites you automate, are out of scope.
