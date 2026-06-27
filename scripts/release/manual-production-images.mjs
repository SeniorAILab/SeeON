export function buildAndPushImages({ imageNamespace, imagePlatform, run, sha, dryRun }) {
  const backendImage = `${imageNamespace}/backend:${sha}`;
  const frontImage = `${imageNamespace}/front:${sha}`;
  const mlApiImage = `${imageNamespace}/ml-api:${sha}`;
  const mlWorkerImage = `${imageNamespace}/ml-worker:${sha}`;
  const buildBase = ["build", "--platform", imagePlatform];
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
  run("docker", [...buildBase, "-f", "ml/Dockerfile.api", "-t", mlApiImage, "."], {
    dryRun,
  });
  run("docker", ["push", mlApiImage], { dryRun });
  run("docker", [...buildBase, "-f", "ml/Dockerfile.worker", "-t", mlWorkerImage, "."], {
    dryRun,
  });
  run("docker", ["push", mlWorkerImage], { dryRun });
}
