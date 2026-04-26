# RunPod worker: Wan 2.2 Remix I2V

This worker runs ComfyUI for the `/api/wan-remix` workflow.
It includes the required custom nodes and bakes the Remix models into the image.

## Included models (required)

- `models/unet/Wan2.2_Remix_NSFW_i2v_14b_high_lighting_v2.0.safetensors`
- `models/unet/Wan2.2_Remix_NSFW_i2v_14b_low_lighting_fp8_e4m3fn_v2.1.safetensors`
- `models/clip/nsfw_wan_umt5-xxl_fp8_scaled.safetensors`
- `models/vae/wan_2.1_vae.safetensors`

## Build

Place the model files before building:

```
models/unet/Wan2.2_Remix_NSFW_i2v_14b_high_lighting_v2.0.safetensors
models/unet/Wan2.2_Remix_NSFW_i2v_14b_low_lighting_fp8_e4m3fn_v2.1.safetensors
models/clip/nsfw_wan_umt5-xxl_fp8_scaled.safetensors
models/vae/wan_2.1_vae.safetensors
```

```
docker build -t wan2.2-remix-i2v .
```

## Run (local)

```
docker run --gpus all -p 8188:8188 wan2.2-remix-i2v
```

## Example input

Use the ComfyUI API workflow (API JSON format). The main app uses
`functions/api/qwen-workflow.json` plus the node map in
`functions/api/qwen-node-map.json`.

```
{
  "input": {
    "workflow": { "1": { "class_type": "LoadImage", "inputs": { "image": "input.png" } } },
    "images": [
      { "name": "input.png", "image": "<base64>" }
    ]
  }
}
```
