pipeline {
  agent {
    node {
      label 'built-in'
      customWorkspace '/opt/eldercare-fall-ai/repo'
    }
  }

  triggers {
    GenericTrigger(
      tokenCredentialId: 'eldercare-webhook-token',
      printContributedVariables: false,
      printPostContent: false
    )
  }

  options {
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
  }

  parameters {
    // Remove this parameter after the first release build during housekeeping.
    string(name: 'SHA', defaultValue: '', description: 'Set REGISTER-ONLY for a webhook registration-only run')
  }

  environment {
    DOCKER_BUILDKIT = '1'
    NODE_OPTIONS = '--max-old-space-size=1536'
    BUILDX_BUILDER = 'eldercare-local'
    DEPLOY_ROOT = '/opt/eldercare-fall-ai'
  }

  stages {
    stage('Resolve release') {
      when {
        expression { params.SHA != 'REGISTER-ONLY' }
      }
      steps {
        script {
          def resolverOutput = sshagent(credentials: ['eldercare-github-deploy-key']) {
            sh(
              script: '''#!/usr/bin/env sh
                set -eu
                repository='git@github.com:SeniorAILab/eldercare-fall-ai.git'
                if [ ! -d .git ]; then git init 1>&2; fi
                remotes=$(git remote) || { echo 'Unable to list Git remotes.' >&2; exit 1; }
                if printf '%s\n' "$remotes" | grep -Fx 'origin' >/dev/null; then
                  git remote set-url origin "$repository"
                else
                  git remote add origin "$repository"
                fi
                RELEASES_DIR="$DEPLOY_ROOT/releases" sh scripts/deploy/iwinv-resolve-release.sh
              ''',
              returnStdout: true
            ).trim()
          }
          def releaseValues = resolverOutput.readLines().findAll { it.contains('=') }.collectEntries { line ->
            def parts = line.split('=', 2)
            [(parts[0]): parts[1]]
          }
          ['RELEASE_TAG', 'RELEASE_SHA', 'NO_OP'].each { key ->
            if (!releaseValues[key]) {
              error("Resolver output is missing ${key}")
            }
          }
          env.RELEASE_TAG = releaseValues.RELEASE_TAG
          env.RELEASE_SHA = releaseValues.RELEASE_SHA
          env.NO_OP = releaseValues.NO_OP
          if (env.NO_OP != '1') {
            sh '''#!/usr/bin/env sh
              set -eu
              git checkout --detach --force "$RELEASE_SHA"
              git clean -ffdqx
            '''
          }
        }
      }
    }
    stage('Preflight resources') {
      when {
        expression { env.NO_OP != '1' && params.SHA != 'REGISTER-ONLY' }
      }
      steps {
        sh '''#!/usr/bin/env sh
          set -eu
          sh scripts/deploy/iwinv-deploy.sh --preflight-only
        '''
      }
    }

    stage('Configure Buildx') {
      when {
        expression { env.NO_OP != '1' && params.SHA != 'REGISTER-ONLY' }
      }
      steps {
        sh '''#!/usr/bin/env sh
          set -eu
          config="$WORKSPACE/.buildkitd.toml"
          printf '%s\n' '[worker.oci]' '  max-parallelism = 1' > "$config"
          if ! builders=$(docker buildx ls 2>&1); then
            printf '%s\n' 'docker buildx ls failed:' >&2
            printf '%s\n' "$builders" >&2
            exit 1
          fi
          if printf '%s\n' "$builders" | awk -v builder="$BUILDX_BUILDER" 'NR > 1 { name=$1; sub(/[*]$/, "", name); if (name == builder) found=1 } END { exit found ? 0 : 1 }'; then
            docker buildx rm "$BUILDX_BUILDER"
          fi
          docker buildx create --name "$BUILDX_BUILDER" --driver docker-container --buildkitd-config "$config" --use
          docker buildx inspect --bootstrap
        '''
      }
    }

    stage('Build backend') {
      when {
        expression { env.NO_OP != '1' && params.SHA != 'REGISTER-ONLY' }
      }
      steps {
        sh '''#!/usr/bin/env sh
          set -eu
          docker buildx build --builder "$BUILDX_BUILDER" --load \
            --build-arg DEPLOY_SHA="$RELEASE_SHA" \
            --build-arg NODE_OPTIONS="$NODE_OPTIONS" \
            --tag "eldercare-backend:$RELEASE_SHA" --file backend/Dockerfile .
        '''
      }
    }

    stage('Build frontend') {
      when {
        expression { env.NO_OP != '1' && params.SHA != 'REGISTER-ONLY' }
      }
      steps {
        sh '''#!/usr/bin/env sh
          set -eu
          docker buildx build --builder "$BUILDX_BUILDER" --load \
            --build-arg DEPLOY_SHA="$RELEASE_SHA" \
            --build-arg NODE_OPTIONS="$NODE_OPTIONS" \
            --tag "eldercare-front:$RELEASE_SHA" --file front/Dockerfile .
        '''
      }
    }

    stage('Deploy') {
      when {
        expression { env.NO_OP != '1' && params.SHA != 'REGISTER-ONLY' }
      }
      steps {
        lock(resource: 'eldercare-fall-ai-deploy') {
          sh '''#!/usr/bin/env sh
            set -eu
            sh scripts/deploy/iwinv-deploy.sh --sha "$RELEASE_SHA"
          '''
        }
      }
    }
  }

  post {
    failure {
      emailext(
        to: 'gobeumsu@gmail.com',
        subject: "[eldercare-fall-ai] Jenkins deploy failed: ${env.RELEASE_SHA ?: 'unresolved'}",
        body: "Deployment failed for release SHA ${env.RELEASE_SHA ?: 'unresolved'}. Build: ${env.BUILD_URL}"
      )
    }
  }
}
