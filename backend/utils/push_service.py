import os
import json
from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session
from models import PushSubscription
import logging

logger = logging.getLogger(__name__)

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_MAILTO = os.getenv("VAPID_MAILTO")

# We need the public key too for the claims, but usually it's derived or passed?
# pywebpush needs private_key path or string.
# Also needs "vapid_claims" usually containing "sub": mailto.

def send_push_notification(db: Session, user_id: int, title: str, body: str, url: str = "/", extra_data: dict = {}):
    """
    Sends a push notification to all subscriptions for a given user.
    """
    if not VAPID_PRIVATE_KEY:
        logger.warning("VAPID_PRIVATE_KEY not set. Cannot send push notifications.")
        return

    subscriptions = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    
    if not subscriptions:
        return

    vapid_claims = {
        "sub": VAPID_MAILTO
    }
    
    # Construct payload
    # We default to a simple message notification structure if not provided
    notification_data = {
        "title": title,
        "body": body,
        "icon": "/entropy.svg",
        "url": url, # Keep for backward compatibility/simplicity
        **extra_data # Merge any extra data (e.g. type='call', room_id, call_id)
    }

    payload = json.dumps(notification_data)

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh,
                        "auth": sub.auth
                    }
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=vapid_claims,
                headers={
                    "urgency": "high" # High urgency is critical for calls
                }
            )
        except WebPushException as ex:
            if ex.response and ex.response.status_code == 410:
                # Subscription expired or invalid
                db.delete(sub)
                db.commit()
            else:
                logger.error(f"Failed to send push notification: {ex}")
        except Exception as e:
            logger.error(f"Unexpected error sending push: {e}")
