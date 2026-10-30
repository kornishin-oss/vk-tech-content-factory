# Security and privacy

## Report a problem

Open a GitHub issue only for problems that can be described without secrets or private content. Do not attach private media, account sessions or credentials.

## Local data rule

Real content and media remain on the operator's computer. The application binds to `127.0.0.1`, keeps runtime state in memory and stores the working draft in that browser's `localStorage` only when the operator explicitly saves it.

`localStorage` is not encrypted. Do not use it for secrets or highly sensitive source material.

## Credentials

Provider credentials are not implemented in this milestone. Future provider adapters must read credentials from local environment or an official local connector and must never write them to the repository, logs, exported packages or browser storage.
