FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl xz-utils libgl1-mesa-dev libxi6 libxrender1 \
    libxkbcommon0 libsm6 libxxf86vm1 \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir /opt/blender \
    && curl -L https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz | tar -xJ -C /opt/blender --strip-components=1 \
    && ln -s /opt/blender/blender /usr/bin/blender