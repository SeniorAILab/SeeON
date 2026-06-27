export function buildAndPushImages({ imageNamespace, imagePlatform, mlImagePlatform, run, sha, dryRun }) {
  const backendImage = `${imageNamespace}/backend:${sha}`;
  const frontImage = `${imageNamespace}/front:${sha}`;
  const mlApiImage = `${imageNamespace}/ml-api:${sha}`;
  const mlWorkerImage = `${imageNamespace}/ml-worker:${sha}`;
  // Host stack (backend/front) runs on the amd64 Naver Cloud VM; the edge stack
  // (ml-api/ml-worker) runs on the external edge device (aarch64 Jetson by
  // default — ADR-062/ADR-068), so build each target for its own architecture.
  const buildBase = ["build", "--platform", imagePlatform];
  const mlBuildBase = ["build", "--platform", mlImagePlatform ?? imagePlatform];
  const runnerBuildBase = [...buildBase, "--target", "runner"];

  run("docker", [...runnerBuildBase, "-f", "backend/Dockerfile", "-t", backendImage, "."], {
    dryRun,
  });
  run("docker", ["push", backendImage], { dryRun });
  run(
    "docker",
    [
      ...runnerBuildBase,
      "-f",
      "front/Dockerfile",
      "--build-arg",
      "VITE_USE_MOCK=false",
      "--build-arg",
      "VITE_API_BASE_URL=/api/v1",
      "-t",
      frontImage,
      ".",
    ],
    { dryRun },
  );
  run("docker", ["push", frontImage], { dryRun });
  run("docker", [...mlBuildBase, "-f", "ml/Dockerfile.api", "-t", mlApiImage, "."], {
    dryRun,
  });
  run("docker", ["push", mlApiImage], { dryRun });
  run("docker", [...mlBuildBase, "-f", "ml/Dockerfile.worker", "-t", mlWorkerImage, "."], {
    dryRun,
  });
  run("docker", ["push", mlWorkerImage], { dryRun });
}
