# Contributing to WHA-HTTP

Thank you for considering contributing to WHA-HTTP!

## How to contribute

### Reporting bugs

- Check if the issue already exists in the [issue tracker](https://github.com/Thruqe/wha-http/issues)
- Provide clear steps to reproduce the bug
- Include logs and error messages if available
- Mention your environment (Docker version, WhatsApp account type)

### Suggesting features

- Open an issue with the `enhancement` label
- Explain the use case and expected behavior
- Keep suggestions focused and practical

### Submitting pull requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test with at least one real WhatsApp account before submitting
5. Keep PRs focused on a single change or feature
6. Write a clear PR description explaining what and why
7. Submit the PR against the `main` branch

## Development setup

```bash
git clone https://github.com/Thruqe/wha-http.git
cd wha-http
docker build -t wha-http .
```
