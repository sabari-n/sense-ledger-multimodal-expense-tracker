FROM mwader/static-ffmpeg:7.0 AS ffmpeg-stage

FROM python:3.11-slim

WORKDIR /app

COPY --from=ffmpeg-stage /ffmpeg /usr/local/bin/

# Install CPU-only PyTorch (avoids 3GB+ CUDA wheels) then whisper & dependencies
RUN pip install --no-cache-dir torch --extra-index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir openai-whisper flask kafka-python-ng

COPY transcriber.py .

EXPOSE 5000

CMD ["python", "transcriber.py"]
