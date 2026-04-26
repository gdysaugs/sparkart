# RunPod worker: Wan 2.2 I2V Rapid (SmoothMix Safetensors High/Low)

This worker is separate from the existing remix worker.
Use it with a different RunPod endpoint and select `Rapid AIO` in the UI.

## Required model files

- `models/diffusion_models/<SmoothMix High safetensors>`
- `models/diffusion_models/<SmoothMix Low safetensors>`
- `models/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank128_bf16.safetensors`
- `models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`
- `models/vae/wan_2.1_vae.safetensors`
- `models/clip_vision/clip-vision_vit-h.safetensors`

Use these exact filenames in `models/diffusion_models/`:

- `smoothMixWan2214BI2V_i2vV20High.safetensors`
- `smoothMixWan2214BI2V_i2vV20Low.safetensors`

The rapid API workflow applies Lightx2v LoRA automatically with:

- High strength: `3.0`
- Low strength: `1.5`

## Build

```bash
cd /home/adama/sparkart/runpod-worker-wan-rapid
docker build -t suarez123/wan22-tastysin-v8-i2v:smoothmix-v20-i2v-sft .
```

## Push

```bash
docker push suarez123/wan22-tastysin-v8-i2v:smoothmix-v20-i2v-sft
```

## RunPod setting

Set this endpoint in Pages secret:

- `RUNPOD_WAN_RAPID_ENDPOINT_URL`

Then UI model switch works:

- `Remix` -> existing endpoint
- `Rapid AIO` -> rapid endpoint
