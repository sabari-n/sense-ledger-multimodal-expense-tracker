from flask import Flask, request, jsonify
from paddleocr import PaddleOCR
import re
import os
import json
import threading
import time
from kafka import KafkaConsumer, KafkaProducer

app = Flask(__name__)

# Load PaddleOCR 2.8.1 into memory at startup (only once)
print("Loading PaddleOCR model...", flush=True)
ocr = PaddleOCR(use_angle_cls=True, lang='en')
print("PaddleOCR ready.", flush=True)

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "kafka:9092").split(",")
IMAGE_TOPIC = os.getenv("KAFKA_TOPIC_IMAGE_INGESTION", "image-ingestion-events")
TEXT_TOPIC = os.getenv("KAFKA_TOPIC_TEXT_EXTRACTED", "text-extracted-events")


def fix_decimals(text):
    text = re.sub(r'(\d)\s*\.\s*(\d)', r'\1.\2', text)
    text = re.sub(r'(\d{1,6})\s+(\d{2})\b', r'\1.\2', text)
    text = re.sub(r'(?<=\d)O(?=\d)', '0', text)
    text = re.sub(r'(?<=\d)o(?=\d)', '0', text)
    return text


def process_ocr_file(image_path):
    result = ocr.ocr(image_path, cls=True)
    lines = []
    if result and result[0]:
        for line in result[0]:
            if len(line) >= 2 and isinstance(line[1], (tuple, list)):
                text, score = line[1][0], line[1][1]
                if score > 0.4 and text.strip():
                    lines.append(text.strip())
    raw_text = '\n'.join(lines)
    return fix_decimals(raw_text)


def run_kafka_worker():
    """Background Python Kafka worker for PaddleOCR photo text extraction"""
    print(f"Connecting PaddleOCR Kafka worker to brokers: {KAFKA_BROKERS}...", flush=True)
    consumer = None
    producer = None

    while not consumer or not producer:
        try:
            consumer = KafkaConsumer(
                IMAGE_TOPIC,
                bootstrap_servers=KAFKA_BROKERS,
                group_id="ocr-extractor-group",
                auto_offset_reset="latest",
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            )
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BROKERS,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            print("PaddleOCR Kafka Worker connected successfully!", flush=True)
        except Exception as e:
            print(f"Waiting for Kafka broker... ({e})", flush=True)
            time.sleep(5)

    for msg in consumer:
        try:
            event = msg.value
            msg_type = event.get("messageType")
            if msg_type != "photo":
                continue

            image_path = event.get("filePath")
            if not image_path or not os.path.exists(image_path):
                print(f"[OCR Worker] Image file not found: {image_path}", flush=True)
                continue

            print(f"[OCR Worker] Processing OCR for event {event.get('eventId')}...", flush=True)
            t0 = time.time()
            extracted_text = process_ocr_file(image_path)
            ocr_duration_ms = int((time.time() - t0) * 1000)
            print(f"[OCR Worker] Extracted text ({ocr_duration_ms}ms): '{extracted_text}'", flush=True)

            timings = event.get("timings", {})
            timings["ocrMs"] = ocr_duration_ms

            out_event = {
                **event,
                "rawText": extracted_text,
                "timings": timings,
                "extractedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }

            producer.send(TEXT_TOPIC, value=out_event)
            producer.flush()
            print(f"[OCR Worker] Published to {TEXT_TOPIC}", flush=True)

        except Exception as e:
            print(f"[OCR Worker] Error processing message: {e}", flush=True)


# Start Kafka worker in a daemon thread
kafka_thread = threading.Thread(target=run_kafka_worker, daemon=True)
kafka_thread.start()


@app.route('/ocr', methods=['POST'])
def run_ocr():
    data = request.get_json()
    if not data or 'image_path' not in data:
        return jsonify({'error': 'No image_path provided'}), 400

    image_path = data['image_path']
    if not os.path.exists(image_path):
        return jsonify({'error': f'Image file not found: {image_path}'}), 404

    try:
        extracted = process_ocr_file(image_path)
        return jsonify({'text': extracted})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host='0.0.0.0', port=5001, debug=debug, use_reloader=False)
