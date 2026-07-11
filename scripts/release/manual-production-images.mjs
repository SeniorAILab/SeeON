// Host stack (backend/front) runs on the amd64 Naver Cloud VM.
const HOST_PLATFORM = "linux/amd64";

export function buildAndPushImages({ imageNamespace, run, sha, dryRun }) {
  const backendImage = `${imageNamespace}/backend:${sha}`;
  const frontImage = `${imageNamespace}/front:${sha}`;
  const runnerBuildBase = ["build", "--platform", HOST_PLATFORM, "--target", "runner"];

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
}
