#!/bin/bash

# Define variables
ENV=${1:-"staging"}
IMAGE_NAME="taiphamdac/stocktraders-ai-fe-$ENV"
TAG="latest"
PLATFORM="linux/amd64"

# Build the Docker image
echo "Building the Docker image for platform $PLATFORM..."
docker build --no-cache --platform $PLATFORM --build-arg env=$ENV -t $IMAGE_NAME:$TAG .

# Check if the build was successful
if [ $? -eq 0 ]; then
    echo "Docker image built successfully: $IMAGE_NAME:$TAG"
else
    echo "Docker build failed. Exiting."
    exit 1
fi

# Tag the image (optional, same tag so this may be redundant)
echo "Tagging the Docker image..."
docker tag $IMAGE_NAME:$TAG $IMAGE_NAME:$TAG

# Push the image to Docker Hub
echo "Pushing the Docker image to Docker Hub..."
docker push $IMAGE_NAME:$TAG

# Check if the push was successful
if [ $? -eq 0 ]; then
    echo "Docker image pushed successfully: $IMAGE_NAME:$TAG"
else
    echo "Failed to push the image. Exiting."
    exit 1
fi