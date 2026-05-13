module message_queue

// State space ---------------------------------------------------------------

sig Message {}

sig Conversation {
  var queue:    seq Message,
  var inFlight: lone Message,
  // ghost set of messages that have been "delivered" (entered inFlight at
  // least once). Used to phrase safety properties without consuming queue
  // content.
  var delivered: set Message,
}

// Initial state -------------------------------------------------------------

pred init {
  all c: Conversation {
    no c.queue.elems
    no c.inFlight
    no c.delivered
  }
}

// Transitions ---------------------------------------------------------------

pred enqueue[c: Conversation, m: Message] {
  m not in c.queue.elems
  m != c.inFlight
  c.queue' = c.queue.add[m]
  c.inFlight' = c.inFlight
  c.delivered' = c.delivered
  all o: Conversation - c {
    o.queue' = o.queue
    o.inFlight' = o.inFlight
    o.delivered' = o.delivered
  }
}

pred dequeue[c: Conversation] {
  no c.inFlight
  some c.queue.elems
  let head = c.queue.first {
    c.inFlight' = head
    c.queue' = c.queue.rest
    c.delivered' = c.delivered + head
  }
  all o: Conversation - c {
    o.queue' = o.queue
    o.inFlight' = o.inFlight
    o.delivered' = o.delivered
  }
}

pred steer[c: Conversation, m: Message] {
  some c.inFlight
  m != c.inFlight
  m not in c.queue.elems
  c.inFlight' = m
  c.queue' = c.queue
  c.delivered' = c.delivered + m
  all o: Conversation - c {
    o.queue' = o.queue
    o.inFlight' = o.inFlight
    o.delivered' = o.delivered
  }
}

pred complete[c: Conversation] {
  some c.inFlight
  no c.inFlight'
  c.queue' = c.queue
  c.delivered' = c.delivered
  all o: Conversation - c {
    o.queue' = o.queue
    o.inFlight' = o.inFlight
    o.delivered' = o.delivered
  }
}

pred interrupt[c: Conversation] {
  some c.inFlight
  no c.inFlight'
  c.queue' = c.queue
  c.delivered' = c.delivered
  all o: Conversation - c {
    o.queue' = o.queue
    o.inFlight' = o.inFlight
    o.delivered' = o.delivered
  }
}

pred stutter {
  all c: Conversation {
    c.queue' = c.queue
    c.inFlight' = c.inFlight
    c.delivered' = c.delivered
  }
}

pred step {
  stutter
  or (some c: Conversation, m: Message | enqueue[c, m])
  or (some c: Conversation | dequeue[c])
  or (some c: Conversation, m: Message | steer[c, m])
  or (some c: Conversation | complete[c])
  or (some c: Conversation | interrupt[c])
}

fact traces {
  init
  always step
}

// Reachability scenarios ----------------------------------------------------

run twoEnqueuesOneCompletion {
  some disj m1, m2: Message, c: Conversation {
    eventually (m1 in c.queue.elems and m2 in c.queue.elems)
    eventually (no c.inFlight and m2 in c.queue.elems)
  }
} for 3 Message, 1 Conversation, 12 steps

run steerWhileBusy {
  some disj m1, m2: Message, c: Conversation {
    eventually (c.inFlight = m1)
    eventually (c.inFlight = m2)
  }
} for 3 Message, 1 Conversation, 12 steps

// Safety -------------------------------------------------------------------

check atMostOneInFlight {
  all c: Conversation | always lone c.inFlight
} for 3 Message, 2 Conversation, 10 steps

check steerNeverConsumesQueue {
  all c: Conversation, m: Message |
    always (
      steer[c, m] implies c.queue' = c.queue
    )
} for 3 Message, 2 Conversation, 10 steps

check inFlightAndQueueDisjoint {
  all c: Conversation |
    always (
      some c.inFlight implies c.inFlight not in c.queue.elems
    )
} for 3 Message, 2 Conversation, 10 steps
