"""
Run once to generate APP_PASSWORD_HASH and SECRET_KEY for your environment.
Usage: python utility/hash_password.py
"""
import getpass
import os
import secrets
import base64
from argon2 import PasswordHasher

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)

password = getpass.getpass("Enter your desired login password: ")
confirm  = getpass.getpass("Confirm: ")

if password != confirm:
    print("Passwords do not match. Aborting.")
    exit(1)

hashed     = ph.hash(password)
secret_key = base64.b64encode(secrets.token_bytes(32)).decode()

print("\nRun the following on this machine (add to ~/.bashrc to persist):\n")
print(f'export APP_PASSWORD_HASH=\'{hashed}\'')
print(f'export SECRET_KEY=\'{secret_key}\'')

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
write_env = input(f"\nWrite values to {env_path}? [y/N]: ").strip().lower()
if write_env == "y":
    with open(env_path, "w") as f:
        f.write(f"APP_PASSWORD_HASH='{hashed}'\n")
        f.write(f"SECRET_KEY='{secret_key}'\n")
    print(f".env written to {env_path}")
