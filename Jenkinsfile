pipeline {
  agent {
    node {
      label 'built-in'
      customWorkspace '/opt/eldercare-fall-ai/repo'
    }
  }

  options {
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
  }

  parameters {
    string(name: 'SHA', defaultValue: '', description: 'GitHub webhook commit SHA')
    string(name: 'REF', defaultValue: 'refs/heads/main', description: 'GitHub webhook ref')
  }

  environment {
    DOCKER_BUILDKIT = '1'
    NODE_OPTIONS = '--max-old-space-size=1536'
    BUILDX_BUILDER = 'eldercare-local'
  }

  stages {
    stage('Validate event') {
      steps {
        sh '''#!/usr/bin/env sh
          set -eu
          case "$SHA" in
            [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
            *) echo 'SHA must be exactly 40 lowercase hexadecimal characters.' >&2; exit 1 ;;
          esac
          [ "$REF" = 'refs/heads/main' ] || { echo 'REF must be refs/heads/main.' >&2; exit 1; }
        '''
      }
    }

    stage('Fetch exact main') {
      steps {
        sshagent(credentials: ['eldercare-github-deploy-key']) {
          sh '''#!/usr/bin/env sh
            set -eu
            if [ ! -d .git ]; then git init; fi
            git remote remove origin >/dev/null 2>&1 || :
            git remote add origin git@github.com:SeniorAILab/eldercare-fall-ai.git
            git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
            origin_sha=$(git rev-parse refs/remotes/origin/main)
            if [ "$origin_sha" != "$SHA" ]; then
              echo "Discarding stale event for $SHA; origin/main is $origin_sha." >&2
              exit 1
            fi
            git checkout --detach --force "$SHA"
            git clean -ffdqx
          '''
        }
      }
    }

    stage('Configure Buildx') {
      steps {
        sh '''#!/usr/bin/env sh
          set -eu
          config="$WORKSPACE/.buildkitd.toml"
          printf '%s\n' '[worker.oci]' '  max-parallelism = 1' > "$config"
          if ! docker buildx inspect "$BUILDX_BUILDER" >/dev/null 2>&1; then
            docker buildx create --name "$BUILDX_BUILDER" --driver docker-container --buildkitd-config "$config" --use
          else
            docker buildx use "$BUILDX_BUILDER"
          fi
          docker buildx inspect --bootstrap
        '''
      }
    }

    stage('Build backend') {
      steps {
        sh '''#!/usr/bin/env sh
          set -eu
          docker buildx build --builder "$BUILDX_BUILDER" --load \
            --build-arg DEPLOY_SHA="$SHA" \
            --build-arg NODE_OPTIONS="$NODE_OPTIONS" \
            --tag "eldercare-backend:$SHA" --file backend/Dockerfile .
        '''
      }
    }

    stage('Build frontend') {
      steps {
        sh '''#!/usr/bin/env sh
          set -eu
          docker buildx build --builder "$BUILDX_BUILDER" --load \
            --build-arg DEPLOY_SHA="$SHA" \
            --build-arg NODE_OPTIONS="$NODE_OPTIONS" \
            --tag "eldercare-front:$SHA" --file front/Dockerfile .
        '''
      }
    }

    stage('Deploy') {
      steps {
        lock(resource: 'eldercare-fall-ai-deploy') {
          sh '''#!/usr/bin/env sh
            set -eu
            sh scripts/deploy/iwinv-deploy.sh --sha "$SHA"
          '''
        }
      }
    }
  }

  post {
    failure {
      emailext(
        to: 'gobeumsu@gmail.com',
        subject: "[eldercare-fall-ai] Jenkins deploy failed: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: "Deployment failed for SHA ${params.SHA}. Build: ${env.BUILD_URL}"
      )
    }
  }
}
