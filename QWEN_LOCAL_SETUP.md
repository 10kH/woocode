# Qwen3-Coder 로컬 설정 가이드

## 빠른 시작 (Quick Start)

### 1. Python 환경 설정
```bash
# Python 3.8+ 필요
python3 -m venv ~/.woocode/qwen-venv
source ~/.woocode/qwen-venv/bin/activate

# 필수 패키지 설치
pip install torch transformers accelerate
pip install fastapi uvicorn
```

### 2. GPU 사용자 (NVIDIA)
```bash
# CUDA 지원 PyTorch 설치
pip install torch --index-url https://download.pytorch.org/whl/cu118

# 선택: 4-bit 양자화 (메모리 절약)
pip install bitsandbytes
```

### 3. 서버 시작
```bash
# 작은 모델로 테스트 (1.5B)
export QWEN_MODEL="Qwen/Qwen2.5-Coder-1.5B-Instruct"
python3 local-models/qwen_server.py

# 또는 큰 모델 (GPU 필요)
export QWEN_MODEL="Qwen/Qwen3-Coder-30B-A3B-Instruct"
python3 local-models/qwen_server.py
```

### 4. WooCode 실행
```bash
# 다른 터미널에서
export WOOCODE_PROVIDER=qwen-local
woocode
```

## 모델 선택 가이드

### 시스템 요구사항별 추천 모델

| 모델 | 크기 | RAM 요구사항 | GPU 요구사항 | 성능 |
|------|------|-------------|-------------|------|
| Qwen2.5-Coder-1.5B | 3GB | 8GB | 선택사항 | 빠름, 기본 코딩 |
| Qwen2.5-Coder-7B | 14GB | 16GB | 권장 (8GB VRAM) | 좋음, 복잡한 코딩 |
| Qwen2.5-Coder-32B | 64GB | 32GB+ | 필수 (24GB+ VRAM) | 최고, 고급 작업 |
| Qwen3-Coder-30B-A3B | 60GB | 32GB+ | 필수 (24GB+ VRAM) | 최고, 특화 코딩 |

### 메모리 부족 시 해결책

1. **4-bit 양자화 사용** (GPU만 해당)
   ```bash
   pip install bitsandbytes
   # 서버가 자동으로 감지하여 사용
   ```

2. **더 작은 모델 사용**
   ```bash
   export QWEN_MODEL="Qwen/Qwen2.5-Coder-1.5B-Instruct"
   ```

3. **CPU 오프로딩** (느림)
   - 서버가 자동으로 처리

## 문제 해결

### "ModuleNotFoundError" 오류
```bash
pip install -r local-models/requirements.txt
```

### "CUDA out of memory" 오류
- 더 작은 모델 사용
- bitsandbytes 설치하여 4-bit 양자화 활성화
- 다른 GPU 프로세스 종료

### 서버가 시작되지 않음
```bash
# Python 버전 확인 (3.8+ 필요)
python3 --version

# 포트 확인
lsof -i :8765

# 로그 확인
python3 local-models/qwen_server.py 2>&1 | tee server.log
```

### 모델 다운로드가 느림
- 첫 실행 시 모델을 다운로드합니다 (수 GB)
- HuggingFace 토큰 사용으로 속도 향상:
  ```bash
  export HF_TOKEN="your_token_here"
  ```

## 고급 설정

### 커스텀 포트 사용
```bash
export QWEN_SERVER_PORT=8888
python3 local-models/qwen_server.py
```

### systemd 서비스 설정
```bash
# ~/.config/systemd/user/woocode-qwen.service 생성
[Unit]
Description=WooCode Qwen Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/woody/workspace/woocode
ExecStart=/home/woody/.woocode/qwen-venv/bin/python3 local-models/qwen_server.py
Environment="QWEN_MODEL=Qwen/Qwen2.5-Coder-7B-Instruct"
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable woocode-qwen
systemctl --user start woocode-qwen
```

## 성능 최적화

### GPU 가속
- NVIDIA GPU + CUDA 11.8+ 권장
- AMD GPU: ROCm 지원 (실험적)

### 메모리 최적화
- `torch.cuda.empty_cache()` 자동 실행
- 양자화로 메모리 사용량 75% 감소

### 속도 최적화
- Flash Attention 2 자동 활성화 (지원 시)
- KV 캐시 최적화

## API 엔드포인트

서버는 다음 엔드포인트를 제공합니다:

- `GET /` - 상태 확인
- `POST /generate` - 텍스트 생성
- `GET /models` - 사용 가능한 모델 목록

## 테스트

```bash
# 서버 상태 확인
curl http://localhost:8765/

# 간단한 생성 테스트
curl -X POST http://localhost:8765/generate \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Write a hello world in Python"}
    ],
    "max_tokens": 100
  }'
```

## 추가 도움말

- 이슈: https://github.com/woocode/woocode/issues
- 문서: https://docs.woocode.ai
- HuggingFace 모델: https://huggingface.co/Qwen