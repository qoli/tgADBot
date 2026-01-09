#!/bin/bash

export NVM_DIR="$HOME/.nvm"
# 載入 nvm
[ -s "/usr/local/opt/nvm/nvm.sh" ] && \. "/usr/local/opt/nvm/nvm.sh"

nvm exec 24.11.1 node bot.js
