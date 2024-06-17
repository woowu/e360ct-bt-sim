CFLAGS := -Wall -Werror

SRCS := rtscts.c
OBJS := ${SRCS:.c=.o}
PROG := rtscts

.PHONY: all
all: ${PROG}

${PROG}: ${OBJS}
	${CC} $< -o $@

clean:
	rm -f ${PROG} ${OBJS}

%.o: %.c
	${CC} ${CFLAGS} -c $<
