#!/bin/bash

# Environment to set prior to calling this script :
#
# IMAGE_TAG  : release or snapshot
# CONFIG_VAR : name of the SSM parameter containing the configuration
# CONTAINER  : name of the container to start
# LOG_GROUP  : aws log group for the container
#

echo "Authenticating to ECR"
aws ecr get-login-password --region eu-west-3 | sudo docker login --username AWS --password-stdin 940219468121.dkr.ecr.eu-west-3.amazonaws.com
[ $? -eq 0 ] || exit

echo "Pulling ${IMAGE_TAG} image"
sudo docker pull 940219468121.dkr.ecr.eu-west-3.amazonaws.com/yz-image:${IMAGE_TAG}
[ $? -eq 0 ] || exit

echo "Loading config from $CONFIG_VAR"
CONFIG=$(aws ssm get-parameter --no-paginate --name $CONFIG_VAR --query 'Parameter.Value' --output text)
[ $? -eq 0 ] || exit

echo "Starting container $CONTAINER"
sudo docker run --log-driver=awslogs --log-opt awslogs-create-group=true --log-opt awslogs-group=${LOG_GROUP} \
  -d --name $CONTAINER --restart always --network db_net \
  -e "CONFIG=${CONFIG}" \
  --health-cmd "curl -f http://localhost/health" \
  --health-interval 30s --health-timeout 10s --health-retries 5 \
  940219468121.dkr.ecr.eu-west-3.amazonaws.com/yz-image:${IMAGE_TAG}
[ $? -eq 0 ] || exit

sudo docker network connect api_net $CONTAINER
[ $? -eq 0 ] || exit

rm -v $0

echo "Done"
