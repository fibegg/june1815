module session_lifecycle

// State space ---------------------------------------------------------------

abstract sig Status {}
one sig Spawned, Ready, Busy, Idle, Killed extends Status {}

sig Session {
  var status: one Status,
}

// Initial state -------------------------------------------------------------

pred init {
  all s: Session | s.status = Spawned
}

// Transitions ---------------------------------------------------------------

pred others[s: Session] {
  all o: Session - s | o.status' = o.status
}

pred firstPromptReady[s: Session] {
  s.status = Spawned
  s.status' = Ready
  others[s]
}

pred sendMessage[s: Session] {
  s.status in (Ready + Idle)
  s.status' = Busy
  others[s]
}

pred turnDone[s: Session] {
  s.status = Busy
  s.status' = Idle
  others[s]
}

pred interrupt[s: Session] {
  s.status = Busy
  s.status' = Idle
  others[s]
}

pred kill[s: Session] {
  s.status != Killed
  s.status' = Killed
  others[s]
}

pred stutter {
  all s: Session | s.status' = s.status
}

pred step {
  stutter
  or (some s: Session |
        firstPromptReady[s] or sendMessage[s] or turnDone[s]
        or interrupt[s] or kill[s])
}

// Trace fact ----------------------------------------------------------------

fact traces {
  init
  always step
}

// Reachability scenarios (expected SAT) -------------------------------------

run reachReady {
  some s: Session | eventually s.status = Ready
} for 1 Session, 6 steps

run reachBusy {
  some s: Session | eventually s.status = Busy
} for 1 Session, 8 steps

run killAfterBusy {
  some s: Session {
    eventually (s.status = Busy)
    eventually (s.status = Killed)
  }
} for 1 Session, 10 steps

// Safety properties (expected UNSAT) ----------------------------------------

check killedIsTerminal {
  all s: Session | always (s.status = Killed implies always s.status = Killed)
} for 3 Session, 10 steps

check noBusyBeforeReady {
  all s: Session | always (s.status = Busy implies once s.status = Ready)
} for 3 Session, 10 steps

check interruptReachesIdleInOneStep {
  // If the only transition fired is `interrupt`, the next state is Idle.
  all s: Session |
    always (
      (s.status = Busy and interrupt[s]) implies after s.status = Idle
    )
} for 3 Session, 8 steps
