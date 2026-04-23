# Copyright 2025 Alibaba Group Holding Ltd.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM golang:1.24.0 AS builder

WORKDIR /build

ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown

# Prepare local modules to satisfy replace directives.
COPY opensandbox_components/internal/go.mod opensandbox_components/internal/go.sum ./opensandbox_components/internal/
COPY opensandbox_components/execd/go.mod opensandbox_components/execd/go.sum ./opensandbox_components/execd/

# Download deps with only mod files for better caching.
RUN cd opensandbox_components/internal && go mod download
RUN cd opensandbox_components/execd && go mod download

# Copy sources.
COPY opensandbox_components/internal ./opensandbox_components/internal
COPY opensandbox_components/execd ./opensandbox_components/execd

WORKDIR /build/opensandbox_components/execd

RUN CGO_ENABLED=0 go build \
    -ldflags "-X 'github.com/alibaba/opensandbox/internal/version.Version=${VERSION}' \
              -X 'github.com/alibaba/opensandbox/internal/version.BuildTime=${BUILD_TIME}' \
              -X 'github.com/alibaba/opensandbox/internal/version.GitCommit=${GIT_COMMIT}'" \
    -o /build/execd ./main.go

RUN CGO_ENABLED=0 GOOS=windows go build \
    -ldflags "-X 'github.com/alibaba/opensandbox/internal/version.Version=${VERSION}' \
              -X 'github.com/alibaba/opensandbox/internal/version.BuildTime=${BUILD_TIME}' \
              -X 'github.com/alibaba/opensandbox/internal/version.GitCommit=${GIT_COMMIT}'" \
    -o /build/execd.exe ./main.go

FROM alpine:latest

COPY --from=builder /build/execd .
COPY --from=builder /build/execd.exe ./execd.exe
COPY opensandbox_components/execd/bootstrap.sh ./bootstrap.sh
COPY opensandbox_components/execd/install.bat ./install.bat

ENTRYPOINT ["./execd"]
