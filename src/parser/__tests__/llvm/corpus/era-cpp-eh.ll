; C++ exception handling: two invokes sharing one landing pad, a landingpad
; with resume, and a normal return path. Invokes use the modern two-line form.
declare void @may_throw()

declare i32 @__gxx_personality_v0(...)

define void @run() personality ptr @__gxx_personality_v0 {
entry:
  invoke void @may_throw()
          to label %cont1 unwind label %lpad

cont1:
  invoke void @may_throw()
          to label %cont2 unwind label %lpad

cont2:
  ret void

lpad:
  %lp = landingpad { ptr, i32 } cleanup
  resume { ptr, i32 } %lp
}
