import uuid
from pathlib import Path

from app.config.settings import settings

UPLOADS_DIR = settings.UPLOADS_DIR


async def upload_file(file_data: bytes, filename: str, content_type: str) -> str:
    if settings.STORAGE_TYPE == "s3":
        return await _upload_to_s3(file_data, filename, content_type)

    return _upload_to_local(file_data, filename)


def _upload_to_local(file_data: bytes, filename: str) -> str:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    ext = Path(filename).suffix
    new_filename = f"{uuid.uuid4()}{ext}"
    file_path = UPLOADS_DIR / new_filename

    with open(file_path, "wb") as file_handle:
        file_handle.write(file_data)

    return f"/uploads/{new_filename}"


async def _upload_to_s3(file_data: bytes, filename: str, content_type: str) -> str:
    from app.config.aws import get_s3_client

    s3 = get_s3_client()
    ext = Path(filename).suffix
    key = f"uploads/{uuid.uuid4()}{ext}"

    s3.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=file_data,
        ContentType=content_type,
        ACL="public-read",
    )

    return f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"


async def get_presigned_url(file_name: str, file_type: str) -> dict:
    if settings.STORAGE_TYPE != "s3":
        raise ValueError("Pre-signed URL can only be used when STORAGE_TYPE is s3")

    from app.config.aws import get_s3_client

    s3 = get_s3_client()
    ext = Path(file_name).suffix
    key = f"uploads/{uuid.uuid4()}{ext}"

    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": key,
            "ContentType": file_type,
            "ACL": "public-read",
        },
        ExpiresIn=900,
    )

    file_url = f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"

    return {"uploadUrl": upload_url, "fileUrl": file_url}
