pipeline {
    agent any

    environment {
        NODE_ENV = 'development'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                // Use 'npm ci' for reliable builds
                sh 'npm ci'
            }
        }

        stage('Linting') {
            steps {
                // Run ESLint
                sh 'npm run lint'
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    dockerImage = docker.build("backend-api:${env.BUILD_ID}")
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
