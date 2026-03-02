# RunPod worker: Wan 2.2 I2V Rapid (separate)

This worker is separate from the existing remix worker.
Use it with a different RunPod endpoint and select `Rapid AIO` in the UI.

## Required model files

- `models/checkpoints/WAN/wan2.2-i2v-rapid-aio.safetensors`
- `models/clip_vision/clip-vision_vit-h.safetensors`

## Build

```bash
cd /home/adama/LTX2/runpod-worker-wan-rapid
docker build -t wan2.2-i2v-rapid .
```

## Push example

```bash
docker tag wan2.2-i2v-rapid suarez123/wan-i2v-gguf:rapid-v1
docker push suarez123/wan-i2v-gguf:rapid-v1
```

## RunPod setting

Set this endpoint in Pages secret:

- `RUNPOD_WAN_RAPID_ENDPOINT_URL`

Then UI model switch works:

- `Remix（既存）` -> existing endpoint
- `Rapid AIO（新規）` -> rapid endpoint
