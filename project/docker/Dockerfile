# AIMO Python execution image for the dsh-aimo code-runtime-docker backend.
# Minimal, read-only-friendly: the container runs the bootstrap as a non-root
# user with the model program piped in on stdin and framed JSON out on stdout.

# Docker Hub is unreachable from this machine; route the base image through a
# mirror (docker.m.daocloud.io mirrors docker.io/library/...).
FROM docker.m.daocloud.io/library/python:3.13-slim

# Scientific stack the verifier/solver rely on. `sympy` pulls `mpmath` as a
# dependency. pypi.org's numpy index page is flaky from this network, so use the
# Aliyun PyPI mirror (verified reachable from inside the build VM). numpy is a
# SEPARATE layer so a numpy failure never blocks the sympy image.
RUN pip install -i https://mirrors.aliyun.com/pypi/simple/ --no-cache-dir sympy
RUN pip install -i https://mirrors.aliyun.com/pypi/simple/ --no-cache-dir numpy

# A non-root user so a hostile program cannot trivially escape via root.
RUN useradd --create-home --uid 1000 sandbox
USER sandbox
WORKDIR /home/sandbox

# The fd-1 JSON-lines bootstrap (see bootstrap.py).
COPY --chown=sandbox:sandbox bootstrap.py /opt/bootstrap.py

ENTRYPOINT ["python3", "/opt/bootstrap.py"]
