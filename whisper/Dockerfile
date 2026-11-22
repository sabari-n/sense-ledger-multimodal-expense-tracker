FROM mwader/static-ffmpeg:7.0 AS ffmpeg-stage

FROM python:3.11-slim

WORKDIR /app

COPY --from=ffmpeg-stage /ffmpeg /usr/local/bin/

# PyTorch build: "cpu" avoids the 3GB+ CUDA wheels, "cu126" is used when AI_DEVICE=nvidia
ARG TORCH_VARIANT=cpu

RUN pip install --no-cache-dir torch --extra-index-url https://download.pytorch.org/whl/${TORCH_VARIANT} && \
    pip install --no-cache-dir openai-whisper flask kafka-python-ng

COPY transcriber.py .

EXPOSE 5000

CMD ["python", "transcriber.py"]
