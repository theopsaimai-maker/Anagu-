# ANAGU Registry Firestore Security Specification (Phase 0)

## 1. Core Data Invariants
1. **Master Source of Truth**: Parcels reside in `/parcels/{parcelId}` (non-PII cadastral data); sensitive applicant identity (`applicantNin`) resides in `/parcel_identities/{parcelId}` and requires an atomic `existsAfter(/parcels/{parcelId})` check.
2. **Mandatory Approval Gate**: A non-admin user submitting `/parcels/{parcelId}` MUST start in `status == 'draft'` (`Waiting for admin approval`) with no pre-minted `tokenId`, `txHash`, `blockNumber`, or `revocationData`.
3. **Immutable Ownership & Identifiers**: On updates, `id`, `cadastralRef`, `ownerUid`, and `createdAt` cannot change.
4. **Role Escalation Prevention**: Users in `/users/{userId}` can only choose `citizen`, `surveyor`, or `oracle` (`admin` is forbidden), cannot change their own `role` after creation, and cannot write `/admins/{adminId}` unless already an admin.
5. **PII Isolation**: `email`, `phone`, `credentialId` live inside `/users/{userId}/private/profile`, `applicantNin` lives inside `/parcel_identities/{parcelId}`, and buyer `inquiries` are strictly restricted to the `buyerUid` owner and verified admins.
6. **Temporal Integrity**: All `createdAt` (on create) and `updatedAt` (on create/update) fields must equal `request.time`.
7. **Zero Unbounded Lists & Size Guards**: Every string field enforces strict `.size()` bounds; `coordinates` and `beacons` enforce bounded `.size() <= 100`.
8. **Query Safety**: Every `allow list` rule evaluates `resource.data` or `isBootstrappedAdmin()` with zero `get()` or `exists()` document reads inside list queries.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Self-Approve on Create**: Citizen attempts `create /parcels/PAR-ATTACK-01` with `status: "registered"` and forged `tokenId: 9999`.
2. **Identity Spoofing**: Citizen attempts `create /parcels/PAR-ATTACK-02` with `ownerUid: "victim-uid"`.
3. **Shadow Field Injection**: User includes unexpected key `isSuperAdmin: true` in `create /parcels/PAR-ATTACK-03`.
4. **Unverified / Anonymous Write**: Unauthenticated client attempts `create /parcels/PAR-ATTACK-04`.
5. **Email Spoof Without Verification**: Token with admin email but `email_verified: false` attempts admin `update /parcels/PAR-2026-1580`.
6. **Citizen Self-Promote to Admin**: User attempts `create /users/{uid}` with `role: "admin"`, or `update /users/{uid}` changing `role` from `"citizen"` to `"surveyor"`.
7. **Orphaned PII Write**: User creates `/parcel_identities/ORPHAN-1` without creating `/parcels/ORPHAN-1` in the same batch.
8. **Cross-User PII Read**: Non-admin user attempts `get /users/{otherUid}/private/profile` or `get /inquiries/{otherInquiryId}`.
9. **Unauthorized Admin Directory Write**: Non-admin user attempts `create /admins/attacker@evil.com`.
10. **ID Poisoning / Oversized Payload**: User attempts `create /parcels/../../bad$id` or passes a 500-vertex coordinates array / 1MB district string.
11. **Timestamp Forgery**: User submits `createdAt: Timestamp(2020-01-01)` instead of `request.time`.
12. **Restricted Audit Topic Forgery**: Non-admin attempts `create /mqtt_events/msg-1` with `topic: "land/title/issued"`.
