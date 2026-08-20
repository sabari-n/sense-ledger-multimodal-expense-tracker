from flask import Flask, request, jsonify
import whisper
import os
import json
import threading
import time
from kafka import KafkaConsumer, KafkaProducer

app = Flask(__name__)

# Load the model into memory immediately when the container starts
print("Loading Whisper model into memory (this happens only once)...", flush=True)
model = whisper.load_model("tiny.en")
print("Whisper model loaded successfully and is ready!", flush=True)

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "kafka:9092").split(",")
AUDIO_TOPIC = os.getenv("KAFKA_TOPIC_AUDIO_INGESTION", "audio-ingestion-events")
TEXT_TOPIC = os.getenv("KAFKA_TOPIC_TEXT_EXTRACTED", "text-extracted-events")


def run_kafka_worker():
    """Background Python Kafka worker for audio transcription"""
    print(f"Connecting Whisper Kafka worker to brokers: {KAFKA_BROKERS}...", flush=True)
    consumer = None
    producer = None

    # Retry connection until Kafka broker is ready
    while not consumer or not producer:
        try:
            consumer = KafkaConsumer(
                AUDIO_TOPIC,
                bootstrap_servers=KAFKA_BROKERS,
                group_id="whisper-transcriber-group",
                auto_offset_reset="latest",
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            )
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BROKERS,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            print("Whisper Kafka Worker connected successfully!", flush=True)
        except Exception as e:
            print(f"Waiting for Kafka broker... ({e})", flush=True)
            time.sleep(5)

    for msg in consumer:
        try:
            event = msg.value
            msg_type = event.get("messageType")
            if msg_type not in ["voice", "audio"]:
                continue

            audio_path = event.get("filePath")
            if not audio_path or not os.path.exists(audio_path):
                print(f"[Whisper Worker] Audio file not found: {audio_path}", flush=True)
                continue

            print(f"[Whisper Worker] Transcribing audio for event {event.get('eventId')}...", flush=True)
            t0 = time.time()
            result = model.transcribe(audio_path)
            raw_text = result["text"].strip()
            whisper_duration_ms = int((time.time() - t0) * 1000)
            print(f"[Whisper Worker] Transcript ({whisper_duration_ms}ms): '{raw_text}'", flush=True)

            timings = event.get("timings", {})
            timings["whisperMs"] = whisper_duration_ms

            out_event = {
                **event,
                "rawText": raw_text,
                "timings": timings,
                "transcribedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }

            producer.send(TEXT_TOPIC, value=out_event)
            producer.flush()
            print(f"[Whisper Worker] Published to {TEXT_TOPIC}", flush=True)

        except Exception as e:
            print(f"[Whisper Worker] Error processing message: {e}", flush=True)


# Start Kafka worker in a daemon thread
kafka_thread = threading.Thread(target=run_kafka_worker, daemon=True)
kafka_thread.start()


@app.route("/transcribe", methods=["POST"])
def transcribe():
    data = request.get_json()
    if not data or "audio_path" not in data:
        return jsonify({"error": "No audio_path provided"}), 400

    audio_path = data["audio_path"]
    if not os.path.exists(audio_path):
        return jsonify({"error": "Audio file not found"}), 404

    try:
        result = model.transcribe(audio_path)
        return jsonify({"text": result["text"].strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug, use_reloader=False)
