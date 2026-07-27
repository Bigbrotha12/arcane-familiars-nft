terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "~> 3.27"
    }
  }
}

provider "aws" {
  profile = "default"
  region = "us-east-1"
}

resource "aws_instance" "AFWebServer" {
  ami           = "ami-013066dc1f1a0259b"
  instance_type = "t2.micro"
  availability_zone = "us-east-1"
  security_groups = ""
  tags = {
    Name        = "AFWebServer"
    Environment = "Dev"
  }
}
