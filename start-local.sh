#!/bin/bash

# WooCode Local Mode Starter Script
# 완전한 로컬 실행을 위한 스크립트

echo "🚀 Starting WooCode in Local Mode..."

# 환경 변수 설정
export WOOCODE_PROVIDER=huggingface
export WOOCODE_API_KEY=dummy
export WOOCODE_USE_LOCAL=true

# 개발 모드로 실행 (번들 문제 회피)
npm start "$@"