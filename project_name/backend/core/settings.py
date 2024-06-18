import os
from pathlib import Path
from typing import List

from fastapi_amis_admin.admin.settings import Settings as AmisSettings

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(AmisSettings):
    name: str = 'Project_name'
    host: str = '127.0.0.1'
    port: int = 2333
    secret_key: str = ''
    allow_origins: List[str] = None


settings = Settings(_env_file=os.path.join(BASE_DIR, '.env'))
