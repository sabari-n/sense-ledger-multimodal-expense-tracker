FROM python:3.11-slim

WORKDIR /app

# System dependencies for OpenCV & Paddle
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Stable CPU combination for PaddleOCR 2.8.1 + PaddlePaddle 2.6.2
RUN pip install --no-cache-dir paddlepaddle==2.6.2 -f https://www.paddlepaddle.org.cn/whl/linux/mkl/avx/stable.html
RUN pip install --no-cache-dir paddleocr==2.8.1 flask kafka-python-ng

COPY ocr_service.py .

EXPOSE 5001

CMD ["python", "ocr_service.py"]
