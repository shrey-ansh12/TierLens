from enum import Enum
from typing import Dict, Any, Optional, Tuple


class ErrorCategory(str, Enum):
    TARGET_APPLICATION_ERROR = "TARGET_APPLICATION_ERROR"
    NETWORK_ERROR = "NETWORK_ERROR"
    HTTP_ERROR = "HTTP_ERROR"
    BROWSER_INFRASTRUCTURE_ERROR = "BROWSER_INFRASTRUCTURE_ERROR"
    ACCESS_RESTRICTION = "ACCESS_RESTRICTION"
    NAVIGATION_TIMEOUT = "NAVIGATION_TIMEOUT"
    SSL_ERROR = "SSL_ERROR"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


class ClassifiedError:
    def __init__(
        self,
        category: ErrorCategory,
        explanation: str,
        retryable: bool,
        technical_details: Optional[Dict[str, Any]] = None
    ):
        self.category = category.value
        self.explanation = explanation
        self.retryable = retryable
        self.technical_details = technical_details or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": self.category,
            "explanation": self.explanation,
            "retryable": self.retryable,
            "technical_details": self.technical_details
        }


def classify_navigation_error(
    error_message: Optional[str] = None,
    http_status: Optional[int] = None,
    page_content: Optional[str] = None,
    page_title: Optional[str] = None
) -> ClassifiedError:
    """
    Deterministically classifies website testing engine failures into 8 distinct categories.
    Never assumes every failure is a target website crash.
    """
    msg = (error_message or "").lower()
    content = (page_content or "").lower()
    title = (page_title or "").lower()
    status = http_status or 0

    # 1. Access Restriction (Bot protection, CAPTCHA, Cloudflare, PerimeterX, etc.)
    bot_markers = [
        "cloudflare", "turnstile", "recaptcha", "hcaptcha", "cf-chl-bypass",
        "just a moment...", "verify you are human", "attention required",
        "bot protection", "ddos-guard", "perimeterx", "datadome", "access denied",
        "challenge-platform", "security check", "err_http2_protocol_error"
    ]
    is_bot_page = any(m in title or m in content for m in ["just a moment...", "verify you are human", "cf-chl-bypass", "turnstile", "challenge-platform"])
    is_bot_error = any(m in msg for m in bot_markers)
    if (status in (403, 429) and (is_bot_page or is_bot_error)) or is_bot_page or "err_http2_protocol_error" in msg:
        return ClassifiedError(
            category=ErrorCategory.ACCESS_RESTRICTION,
            explanation="Target website is protected by automated bot detection or blocked the connection (Bot Firewall / HTTP2 drop). Enterprise sites like Zomato, Swiggy, and Amazon block automated headless browsers.",
            retryable=False,
            technical_details={"http_status": status, "matched_rule": "anti_bot_or_captcha_detected"}
        )

    # 2. Browser Infrastructure Error
    infra_markers = [
        "executable doesn't exist", "executable not found", "failed to launch",
        "browser closed", "target closed", "browser process", "protocol error",
        "spawn enoent", "cannot find module", "driver process exited"
    ]
    if any(k in msg for k in infra_markers):
        return ClassifiedError(
            category=ErrorCategory.BROWSER_INFRASTRUCTURE_ERROR,
            explanation="Test engine browser infrastructure encountered a process launch or lifecycle error.",
            retryable=True,
            technical_details={"message": error_message, "matched_rule": "browser_infrastructure_failure"}
        )

    # 3. SSL / TLS Error
    ssl_markers = [
        "err_cert_", "cert_authority_invalid", "cert_common_name_invalid",
        "cert_date_invalid", "ssl_protocol_error", "ssl_version_or_cipher_mismatch",
        "tlsv1 alert", "certificate has expired", "self-signed certificate",
        "unable to verify the first certificate"
    ]
    if any(k in msg for k in ssl_markers):
        return ClassifiedError(
            category=ErrorCategory.SSL_ERROR,
            explanation="Target server failed SSL/TLS handshake or presents an untrusted/invalid certificate.",
            retryable=False,
            technical_details={"message": error_message, "matched_rule": "ssl_tls_handshake_failure"}
        )

    # 4. Network Error
    net_markers = [
        "err_name_not_resolved", "enotfound", "getaddrinfo", "err_connection_refused",
        "econnrefused", "err_connection_reset", "econnreset", "err_connection_timed_out",
        "err_address_unreachable", "net::err_network_changed", "err_connection_aborted",
        "socket hang up"
    ]
    if any(k in msg for k in net_markers):
        return ClassifiedError(
            category=ErrorCategory.NETWORK_ERROR,
            explanation="Network-level communication failed (DNS unresolvable, connection refused, or reset).",
            retryable=True,
            technical_details={"message": error_message, "matched_rule": "network_layer_failure"}
        )

    # 5. Navigation Timeout
    if "timeouterror" in msg or ("timeout" in msg and any(w in msg for w in ["exceeded", "navigation", "waiting for load"])):
        return ClassifiedError(
            category=ErrorCategory.NAVIGATION_TIMEOUT,
            explanation="Page navigation timed out before reaching a readable state under device network/CPU constraints.",
            retryable=True,
            technical_details={"message": error_message, "matched_rule": "navigation_timeout_exceeded"}
        )

    # 6. HTTP Error (4xx / 5xx)
    if status >= 400:
        desc = "Client Error" if status < 500 else "Server Error"
        retryable = status in (408, 429, 500, 502, 503, 504)
        return ClassifiedError(
            category=ErrorCategory.HTTP_ERROR,
            explanation=f"Target web server responded with HTTP {status} ({desc}).",
            retryable=retryable,
            technical_details={"http_status": status, "matched_rule": f"http_{status}_response"}
        )

    # 7. Target Application Error (Uncaught JS exception, fatal client error)
    app_err_markers = [
        "uncaught", "referenceerror", "typeerror", "syntaxerror", "rangeerror",
        "unhandledrejection", "window.onerror", "react error boundary",
        "cannot read propert", "is not a function", "is not defined",
        "cannot set propert", "unexpected token", "null is not an object",
        "undefined is not an object", "script error"
    ]
    if any(k in msg for k in app_err_markers):
        return ClassifiedError(
            category=ErrorCategory.TARGET_APPLICATION_ERROR,
            explanation="Target web application triggered unhandled client-side runtime JavaScript exceptions.",
            retryable=False,
            technical_details={"message": error_message, "matched_rule": "client_runtime_exception"}
        )

    # 8. Unknown Error
    return ClassifiedError(
        category=ErrorCategory.UNKNOWN_ERROR,
        explanation="An unclassified execution anomaly occurred during the test session.",
        retryable=True,
        technical_details={"message": error_message}
    )
