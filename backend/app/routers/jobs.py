from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.database import get_db, JobRecord
from app.models import JobResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Get the status of a background indexing job."""
    result = await db.execute(select(JobRecord).where(JobRecord.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(
        job_id=job.id,
        bot_id=job.bot_id,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        error=job.error,
    )


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    bot_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List all indexing jobs, optionally filtered by bot_id."""
    stmt = select(JobRecord).order_by(JobRecord.created_at.desc())
    if bot_id:
        stmt = stmt.where(JobRecord.bot_id == bot_id)
    result = await db.execute(stmt)
    return [
        JobResponse(
            job_id=j.id,
            bot_id=j.bot_id,
            status=j.status,
            created_at=j.created_at,
            updated_at=j.updated_at,
            error=j.error,
        )
        for j in result.scalars().all()
    ]
