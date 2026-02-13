import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ReviewRuleSet
from ..schemas import RuleSetCreate, RuleSetUpdate, RuleSetResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rule-sets", tags=["rule-sets"])


@router.get("", response_model=List[RuleSetResponse])
def list_rule_sets(db: Session = Depends(get_db)):
    """
    List all active rule sets.
    """
    rule_sets = db.query(ReviewRuleSet).filter(ReviewRuleSet.is_active == True).order_by(ReviewRuleSet.name).all()
    return rule_sets


@router.post("", response_model=RuleSetResponse)
def create_rule_set(
    rule_set_data: RuleSetCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new rule set.
    """
    # Check for duplicate name
    existing = db.query(ReviewRuleSet).filter(ReviewRuleSet.name == rule_set_data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="A rule set with this name already exists")
    
    rule_set = ReviewRuleSet(
        name=rule_set_data.name,
        description=rule_set_data.description,
        instructions=rule_set_data.instructions
    )
    db.add(rule_set)
    db.commit()
    db.refresh(rule_set)
    
    logger.info(f"Created rule set: {rule_set.name}")
    return rule_set


@router.get("/{rule_set_id}", response_model=RuleSetResponse)
def get_rule_set(rule_set_id: int, db: Session = Depends(get_db)):
    """
    Get a specific rule set.
    """
    rule_set = db.query(ReviewRuleSet).filter(
        ReviewRuleSet.id == rule_set_id,
        ReviewRuleSet.is_active == True
    ).first()
    
    if not rule_set:
        raise HTTPException(status_code=404, detail="Rule set not found")
    
    return rule_set


@router.put("/{rule_set_id}", response_model=RuleSetResponse)
def update_rule_set(
    rule_set_id: int,
    rule_set_data: RuleSetUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a rule set.
    """
    rule_set = db.query(ReviewRuleSet).filter(
        ReviewRuleSet.id == rule_set_id,
        ReviewRuleSet.is_active == True
    ).first()
    
    if not rule_set:
        raise HTTPException(status_code=404, detail="Rule set not found")
    
    # Check for duplicate name if name is being changed
    if rule_set_data.name and rule_set_data.name != rule_set.name:
        existing = db.query(ReviewRuleSet).filter(
            ReviewRuleSet.name == rule_set_data.name,
            ReviewRuleSet.id != rule_set_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A rule set with this name already exists")
    
    # Update fields if provided
    if rule_set_data.name is not None:
        rule_set.name = rule_set_data.name
    if rule_set_data.description is not None:
        rule_set.description = rule_set_data.description
    if rule_set_data.instructions is not None:
        rule_set.instructions = rule_set_data.instructions
    
    db.commit()
    db.refresh(rule_set)
    
    logger.info(f"Updated rule set: {rule_set.name}")
    return rule_set


@router.delete("/{rule_set_id}")
def delete_rule_set(rule_set_id: int, db: Session = Depends(get_db)):
    """
    Soft-delete a rule set.
    """
    rule_set = db.query(ReviewRuleSet).filter(
        ReviewRuleSet.id == rule_set_id,
        ReviewRuleSet.is_active == True
    ).first()
    
    if not rule_set:
        raise HTTPException(status_code=404, detail="Rule set not found")
    
    rule_set.is_active = False
    db.commit()
    
    logger.info(f"Deleted rule set: {rule_set.name}")
    return {"message": "Rule set deleted successfully"}
