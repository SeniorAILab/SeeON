// Host stack (backend/front) runs on the amd64 Naver Cloud VM; the edge stack
// (ml-api/ml-worker) targets an x86 PC with an RTX 50-series GPU
// (linux/amd64, NVIDIA runtime). Jetson/arm64 is out of target for now;
// retargeting will split tags/platforms by hardware class per ralplan decision.
const HOST_PLATFORM = "linux/amd64";
const EDGE_PLATFORM = "linux/amd64";

export function buildAndPushImages({ imageNamespace, run, sha, dryRun }) {
  const backendImage = `${imageNamespace}/backend:${sha}`;
  const frontImage = `${imageNamespace}/front:${sha}`;
  const mlApiImage = `${imageNamespace}/ml-api:${sha}`;
  const mlWorkerImage = `${imageNamespace}/ml-worker:${sha}`;
  const buildBase = ["build", "--platform", HOST_PLATFORM];
  const mlBuildBase = ["build", "--platform", EDGE_PLATFORM];
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
