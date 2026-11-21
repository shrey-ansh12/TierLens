import ipaddress
import socket
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlparse, urljoin
from jose import jwt, JWTError
import bcrypt
from passlib.context import CryptContext
from fastapi import HTTPException, status
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception:
            return False

def get_password_hash(password: str) -> str:
    try:
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")
    except Exception:
        return pwd_context.hash(password)

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None

# ==============================================================================
# SSRF Protection Engine
# ==============================================================================

BLOCKED_IP_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"), # Includes AWS/GCP/Azure metadata 169.254.169.254
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.88.99.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),   # Multicast
    ipaddress.ip_network("240.0.0.0/4"),   # Reserved
    ipaddress.ip_network("255.255.255.255/32"),
    # IPv6
    ipaddress.ip_network("::1/128"),        # Loopback
    ipaddress.ip_network("fc00::/7"),       # Unique local
    ipaddress.ip_network("fe80::/10"),      # Link local
]

def validate_target_url(url: str) -> str:
    """
    Validates URL safety against Server-Side Request Forgery (SSRF).
    Ensures protocol is http/https and resolved IP does not belong to private/internal ranges.
    """
    if not url or not isinstance(url, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL is required and must be a valid string."
        )

    parsed = urlparse(url.strip())
    if parsed.scheme.lower() not in ["http", "https"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported protocol: '{parsed.scheme}'. Only 'http' and 'https' are allowed."
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid URL hostname."
        )

    # Disallow literal localhost, local domains, cloud metadata domains
    disallowed_hostnames = {
        "localhost", "127.0.0.1", "0.0.0.0", "metadata.google.internal",
        "instance-data", "metadata", "kubernetes.default.svc"
    }
    if hostname.lower() in disallowed_hostnames or hostname.lower().endswith(".local") or hostname.lower().endswith(".internal"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Security Violation: Target host '{hostname}' points to a restricted internal domain."
        )

    # Resolve hostname via DNS and check IP addresses
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        resolved_ips = {item[4][0] for item in addr_info}
    except socket.gaierror:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"DNS Resolution Failed: Unable to resolve hostname '{hostname}'."
        )

    for ip_str in resolved_ips:
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            for blocked_net in BLOCKED_IP_NETWORKS:
                if ip_obj in blocked_net:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Security Violation: Host '{hostname}' resolves to private/restricted IP ({ip_str})."
                    )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid IP address resolved from host: {ip_str}"
            )

    return url.strip()


def validate_redirect_url(base_url: str, location_header: str) -> str:
    """
    Validates redirect destinations against SSRF and private network access.
    Handles relative and absolute location targets.
    """
    if not location_header or not str(location_header).strip():
        return base_url
    target = urljoin(base_url, str(location_header).strip())
    return validate_target_url(target)

