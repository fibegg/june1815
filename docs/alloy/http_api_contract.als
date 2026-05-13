module http_api_contract

// State space ---------------------------------------------------------------

abstract sig ConvState {}
one sig Created, Streaming, Idle, Terminated extends ConvState {}

abstract sig EventType {}
one sig TextDelta, ReasoningDelta, ToolUse, Usage,
        Interrupted, Done, Error, Ping extends EventType {}

sig Conversation {
  var state: one ConvState,
  // ghost: events emitted so far in the current stream, in order observed
  var streamEvents: seq EventType,
  // ghost: was Interrupted emitted in the current stream?
  var interruptSeen: lone EventType,
  // counter for total events ever observed (used for the "no events after
  // Terminated" property)
  var anyEventThisStep: lone EventType,
}

// Initial state -------------------------------------------------------------

pred init {
  all c: Conversation {
    c.state = Created
    no c.streamEvents.elems
    no c.interruptSeen
    no c.anyEventThisStep
  }
}

// Transitions ---------------------------------------------------------------

pred otherUnchanged[c: Conversation] {
  all o: Conversation - c {
    o.state' = o.state
    o.streamEvents' = o.streamEvents
    o.interruptSeen' = o.interruptSeen
    o.anyEventThisStep' = o.anyEventThisStep
  }
}

pred startTurn[c: Conversation] {
  c.state in (Created + Idle)
  c.state' = Streaming
  no c.streamEvents'.elems
  no c.interruptSeen'
  no c.anyEventThisStep'
  otherUnchanged[c]
}

pred emitMidStream[c: Conversation, e: EventType] {
  c.state = Streaming
  e in (TextDelta + ReasoningDelta + ToolUse + Usage)
  c.streamEvents' = c.streamEvents.add[e]
  c.interruptSeen' = c.interruptSeen
  c.state' = c.state
  c.anyEventThisStep' = e
  otherUnchanged[c]
}

pred emitInterrupted[c: Conversation] {
  c.state = Streaming
  no c.interruptSeen
  c.streamEvents' = c.streamEvents.add[Interrupted]
  c.interruptSeen' = Interrupted
  c.state' = c.state
  c.anyEventThisStep' = Interrupted
  otherUnchanged[c]
}

pred emitDone[c: Conversation] {
  c.state = Streaming
  c.streamEvents' = c.streamEvents.add[Done]
  c.state' = Idle
  c.interruptSeen' = c.interruptSeen
  c.anyEventThisStep' = Done
  otherUnchanged[c]
}

pred emitError[c: Conversation] {
  c.state = Streaming
  no c.interruptSeen
  c.streamEvents' = c.streamEvents.add[Error]
  c.state' = Idle
  c.interruptSeen' = c.interruptSeen
  c.anyEventThisStep' = Error
  otherUnchanged[c]
}

pred terminate[c: Conversation] {
  c.state != Terminated
  c.state' = Terminated
  c.streamEvents' = c.streamEvents
  c.interruptSeen' = c.interruptSeen
  no c.anyEventThisStep'
  otherUnchanged[c]
}

pred stutter {
  all c: Conversation {
    c.state' = c.state
    c.streamEvents' = c.streamEvents
    c.interruptSeen' = c.interruptSeen
    no c.anyEventThisStep'
  }
}

pred step {
  stutter
  or (some c: Conversation | startTurn[c])
  or (some c: Conversation, e: EventType | emitMidStream[c, e])
  or (some c: Conversation | emitInterrupted[c])
  or (some c: Conversation | emitDone[c])
  or (some c: Conversation | emitError[c])
  or (some c: Conversation | terminate[c])
}

fact traces {
  init
  always step
}

// Reachability scenarios ----------------------------------------------------

run normalTurn {
  some c: Conversation {
    eventually (c.state = Streaming and Done in c.streamEvents.elems)
    eventually c.state = Idle
  }
} for 1 Conversation, 12 steps

run interruptedTurn {
  some c: Conversation {
    eventually (Interrupted in c.streamEvents.elems)
    eventually (Done in c.streamEvents.elems)
  }
} for 1 Conversation, 14 steps

run terminatedAfterIdle {
  some c: Conversation {
    eventually (c.state = Idle and Done in c.streamEvents.elems)
    eventually (c.state = Terminated)
  }
} for 1 Conversation, 14 steps

// Safety properties ---------------------------------------------------------

check noEventsAfterTerminated {
  all c: Conversation |
    always (c.state = Terminated implies no c.anyEventThisStep')
} for 2 Conversation, 12 steps

check interruptedBeforeDoneInSameStream {
  all c: Conversation |
    always (
      (c.state = Streaming and some c.interruptSeen)
      implies Error not in c.streamEvents.elems
    )
} for 2 Conversation, 12 steps

check streamingTransitionsToIdleOnlyViaDoneOrError {
  all c: Conversation |
    always (
      (c.state = Streaming and after c.state = Idle)
      implies (Done = c.anyEventThisStep' or Error = c.anyEventThisStep')
    )
} for 2 Conversation, 12 steps
