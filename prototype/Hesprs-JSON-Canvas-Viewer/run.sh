#!/usr/bin/env bash
# __enable_bash_strict_mode__

main() {
   python3 -m http.server 8000
}

main "${@}"
