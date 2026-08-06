import os

import pytest

os.environ["STARME_ENVIRONMENT"] = "test"
os.environ["STARME_DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["STARME_ALLOW_SENSITIVE_PROCESSING"] = "false"
os.environ["STARME_OPERATOR_API_KEY"] = "test-operator-key"
os.environ["STARME_TOKEN_HASH_PEPPER"] = "test-token-pepper"
os.environ["STARME_DELIVERY_SIGNING_KEY"] = "test-delivery-key"
os.environ["STARME_QUEUE_BACKEND"] = "inline"

from starme import models  # noqa: E402, F401
from starme.database import Base, engine  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():  # type: ignore[no-untyped-def]
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)
