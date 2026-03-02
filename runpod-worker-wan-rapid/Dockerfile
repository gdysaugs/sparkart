FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04

ARG COMFYUI_VERSION=latest

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_PREFER_BINARY=1 \
    PYTHONUNBUFFERED=1 \
    CMAKE_BUILD_PARALLEL_LEVEL=8

RUN apt-get update && apt-get install -y \
    python3.12 \
    python3.12-venv \
    git \
    wget \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    ffmpeg \
    && ln -sf /usr/bin/python3.12 /usr/bin/python \
    && ln -sf /usr/bin/pip3 /usr/bin/pip \
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

RUN wget -qO- https://astral.sh/uv/install.sh | sh \
    && ln -s /root/.local/bin/uv /usr/local/bin/uv \
    && ln -s /root/.local/bin/uvx /usr/local/bin/uvx \
    && uv venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"

RUN uv pip install comfy-cli pip setuptools wheel

RUN /usr/bin/yes | comfy --workspace /comfyui install --version "${COMFYUI_VERSION}" --nvidia

WORKDIR /comfyui

RUN git clone https://github.com/kijai/ComfyUI-WanVideoWrapper /comfyui/custom_nodes/ComfyUI-WanVideoWrapper \
    && if [ -f /comfyui/custom_nodes/ComfyUI-WanVideoWrapper/requirements.txt ]; then \
         uv pip install -r /comfyui/custom_nodes/ComfyUI-WanVideoWrapper/requirements.txt; \
       fi

RUN git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite /comfyui/custom_nodes/ComfyUI-VideoHelperSuite \
    && uv pip install -r /comfyui/custom_nodes/ComfyUI-VideoHelperSuite/requirements.txt

RUN mkdir -p /comfyui/models/checkpoints/WAN /comfyui/models/clip_vision

COPY models/checkpoints/WAN/wan2.2-i2v-rapid-aio.safetensors /comfyui/models/checkpoints/WAN/
COPY models/clip_vision/clip-vision_vit-h.safetensors /comfyui/models/clip_vision/

WORKDIR /

RUN uv pip install runpod requests websocket-client

COPY handler.py /handler.py
COPY start.sh /start.sh
RUN chmod +x /start.sh

RUN rm -rf /comfyui/custom_nodes/ComfyUI-Manager

CMD ["/start.sh"]
