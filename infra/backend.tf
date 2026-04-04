terraform {
  backend "s3" {
    bucket = "rampazzo-tfstate"
    key    = "ordsamling.tfstate"
    region = "eu-north-1"

    # Server-side encryption
    encrypt = true
  }
}
